import { useParams } from 'react-router-dom';

export default function DetailsPage() {
  const { id } = useParams();

  return (
    <div>
      <h1>Details Page</h1>
      <p>Item ID: {id}</p>
    </div>
  );
}
